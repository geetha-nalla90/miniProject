import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, Alert } from 'react-native';

// Sample Component to demonstrate Targeted Request creation in React Native/Expo
export default function TargetedRequest({ currentUserId }) {
  const [targetUserId, setTargetUserId] = useState('');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [quantity, setQuantity] = useState('1');
  const [message, setMessage] = useState('Please help, urgent blood needed.');
  
  const [pendingRequests, setPendingRequests] = useState([]);

  // Fetch pending targeted requests for the currently logged-in user
  const fetchMyTargetedRequests = async () => {
    try {
      const response = await fetch(`http://192.168.0.2:3000/api/requests/new?userId=${currentUserId}`);
      const data = await response.json();
      if (response.ok) {
        setPendingRequests(data);
      } else {
        Alert.alert('Error', data.error);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to fetch targeted requests.');
    }
  };

  useEffect(() => {
    fetchMyTargetedRequests();
  }, [currentUserId]);

  const handleCreateRequest = async () => {
    if (!targetUserId) {
      Alert.alert('Error', 'Please enter a target donor ID.');
      return;
    }

    try {
      const response = await fetch('http://192.168.0.2:3000/api/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          seekerId: currentUserId,
          target_user_id: targetUserId,
          bloodType: bloodGroup,
          quantity: quantity,
          location: 'Sample Hospital|17.3850,78.4867',
          urgency: 'High',
          message: message,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        Alert.alert('Success', 'Targeted request sent successfully to Donor ID: ' + targetUserId);
      } else {
        Alert.alert('Error', data.error);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to create request.');
    }
  };

  const handleAction = async (reqId, action) => {
    const endpoint = action === 'accept' ? 'accept-targeted' : 'reject-targeted';
    try {
      const response = await fetch(`http://192.168.0.2:3000/api/requests/${reqId}/${endpoint}`, {
        method: 'POST',
      });
      const data = await response.json();
      if (response.ok) {
        Alert.alert('Success', `Request ${action}ed successfully.`);
        fetchMyTargetedRequests();
      } else {
        Alert.alert('Error', data.error);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', `Failed to ${action} request.`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Create Targeted Request</Text>
      
      <TextInput style={styles.input} placeholder="Target Donor ID" value={targetUserId} onChangeText={setTargetUserId} keyboardType="numeric" />
      <TextInput style={styles.input} placeholder="Blood Group (e.g., O+)" value={bloodGroup} onChangeText={setBloodGroup} />
      <TextInput style={styles.input} placeholder="Message" value={message} onChangeText={setMessage} />

      <Button title="Send Request to Donor" onPress={handleCreateRequest} />

      <Text style={[styles.header, { marginTop: 30 }]}>My Targeted Requests (Pending)</Text>
      
      {pendingRequests.length === 0 ? (
        <Text style={styles.empty}>No pending targeted requests.</Text>
      ) : (
        <FlatList
          data={pendingRequests}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Request from {item.seekerName}</Text>
              <Text>Blood Needed: {item.bloodType} ({item.quantity} Units)</Text>
              <Text>Message: {item.message}</Text>
              
              <View style={styles.buttonRow}>
                <Button title="Accept" color="#16a34a" onPress={() => handleAction(item.id, 'accept')} />
                <View style={{ width: 10 }} />
                <Button title="Reject" color="#dc2626" onPress={() => handleAction(item.id, 'reject')} />
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    marginBottom: 15,
    borderRadius: 5,
  },
  card: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    backgroundColor: '#f9f9f9',
  },
  cardTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 5,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  empty: {
    color: '#666',
    fontStyle: 'italic',
  }
});
